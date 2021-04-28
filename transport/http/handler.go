//go:generate moq -out service_mock.go . Service

package handler

import (
	"context"
	"log"
	"net/http"
	"path"
	"path/filepath"
	"runtime"
	"time"

	"github.com/gorilla/securecookie"
	"github.com/matryer/way"
	"github.com/nicolasparada/nakama"
	"github.com/nicolasparada/nakama/storage"
	"github.com/nicolasparada/nakama/web/static"
)

type handler struct {
	svc         *nakama.Service
	ctx         context.Context
	store       storage.Store
	cookieCodec *securecookie.SecureCookie
}

// New makes use of the service to provide an http.Handler with predefined routing.
// The provided context is used to stop the running server-sent events.
func New(ctx context.Context, svc *nakama.Service, store storage.Store, cdc *securecookie.SecureCookie, enableStaticCache, embedStaticFiles, serveAvatars bool) http.Handler {
	h := &handler{
		ctx:         ctx,
		svc:         svc,
		store:       store,
		cookieCodec: cdc,
	}

	api := way.NewRouter()
	api.HandleFunc("POST", "/send_magic_link", h.sendMagicLink)
	api.HandleFunc("GET", "/verify_magic_link", h.verifyMagicLink)
	api.HandleFunc("GET", "/credential_creation_options", h.credentialCreationOptions)
	api.HandleFunc("POST", "/credentials", h.registerCredential)
	api.HandleFunc("GET", "/credential_request_options", h.credentialRequestOptions)
	api.HandleFunc("POST", "/webauthn_login", h.webAuthnLogin)
	api.HandleFunc("POST", "/dev_login", h.devLogin)
	api.HandleFunc("GET", "/auth_user", h.authUser)
	api.HandleFunc("GET", "/token", h.token)
	api.HandleFunc("GET", "/users", h.users)
	api.HandleFunc("GET", "/usernames", h.usernames)
	api.HandleFunc("GET", "/users/:username", h.user)
	api.HandleFunc("PUT", "/auth_user/avatar", h.updateAvatar)
	api.HandleFunc("POST", "/users/:username/toggle_follow", h.toggleFollow)
	api.HandleFunc("GET", "/users/:username/followers", h.followers)
	api.HandleFunc("GET", "/users/:username/followees", h.followees)
	api.HandleFunc("POST", "/posts", h.createPost)
	api.HandleFunc("GET", "/users/:username/posts", h.posts)
	api.HandleFunc("GET", "/posts/:post_id", h.post)
	api.HandleFunc("POST", "/posts/:post_id/toggle_like", h.togglePostLike)
	api.HandleFunc("POST", "/posts/:post_id/toggle_subscription", h.togglePostSubscription)
	api.HandleFunc("GET", "/timeline", h.timeline)
	api.HandleFunc("DELETE", "/timeline/:timeline_item_id", h.deleteTimelineItem)
	api.HandleFunc("POST", "/posts/:post_id/comments", h.createComment)
	api.HandleFunc("GET", "/posts/:post_id/comments", h.comments)
	api.HandleFunc("POST", "/comments/:comment_id/toggle_like", h.toggleCommentLike)
	api.HandleFunc("GET", "/notifications", h.notifications)
	api.HandleFunc("GET", "/has_unread_notifications", h.hasUnreadNotifications)
	api.HandleFunc("POST", "/notifications/:notification_id/mark_as_read", h.markNotificationAsRead)
	api.HandleFunc("POST", "/mark_notifications_as_read", h.markNotificationsAsRead)

	api.HandleFunc("HEAD", "/proxy", withCacheControl(time.Hour*24*14)(proxy))

	var fsys http.FileSystem
	if embedStaticFiles {
		log.Println("serving static content from embeded files")
		fsys = http.FS(static.Files)
	} else {
		log.Println("serving static content directly from disk")
		_, file, _, ok := runtime.Caller(0)
		if !ok {
			log.Fatalln("could not get runtime caller")
		}
		fsys = http.Dir(filepath.Join(path.Dir(file), "..", "..", "web", "static"))
	}
	fsrv := http.FileServer(&spaFileSystem{root: fsys})
	if !enableStaticCache {
		fsrv = withoutCache(fsrv)
	}

	r := way.NewRouter()
	r.Handle("*", "/api/...", http.StripPrefix("/api", h.withAuth(api)))
	if serveAvatars {
		r.HandleFunc("GET", "/img/avatars/:name", h.avatar)
	}
	r.Handle("GET", "/...", fsrv)

	return r
}
