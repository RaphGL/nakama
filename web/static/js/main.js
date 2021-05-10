import { guard } from "./auth.js"
import renderErrorPage from "./components/error-page.js"
import { useLang } from "./i18n/i18n.js"
import { createRouter } from "./lib/router.js"

const modulesCache = new Map()
const viewsCache = new Map()
const disconnectEvent = new CustomEvent("disconnect")
const viewAccess = view("access")
const r = createRouter()
r.route("/", guard(view("home"), viewAccess))
r.route("/login-callback", view("login-callback"))
r.route("/search", view("search"))
r.route("/notifications", guard(view("notifications"), viewAccess))
r.route(/^\/users\/(?<username>[a-zA-Z][a-zA-Z0-9_-]{0,17})$/, view("user"))
r.route(/^\/users\/(?<username>[a-zA-Z][a-zA-Z0-9_-]{0,17})\/followers$/, view("followers"))
r.route(/^\/users\/(?<username>[a-zA-Z][a-zA-Z0-9_-]{0,17})\/followees$/, view("followees"))
r.route(/^\/posts\/(?<postID>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/, view("post"))
r.route(/\//, view("not-found"))

useLang(detectLang()).then(() => {
    r.subscribe(renderInto(document.querySelector("main")))
    r.install()
})


function view(name) {
    return (...args) => {
        if (viewsCache.has(name)) {
            const renderPage = viewsCache.get(name)
            return renderPage(...args)
        }
        return importWithCache(`/js/components/${name}-page.js`).then(m => {
            const renderPage = m.default
            viewsCache.set(name, renderPage)
            return renderPage(...args)
        }, renderErrorPage)
    }
}

async function importWithCache(identifier) {
    if (modulesCache.has(identifier)) {
        return modulesCache.get(identifier)
    }
    const m = await import(identifier)
    modulesCache.set(identifier, m)
    return m
}

/**
 * @param {Element} target
 */
function renderInto(target) {
    let pages = /** @type {{node: Node, resolved: Boolean, ctrl: AbortController}[]} */ ([])
    return async result => {
        while (pages.length !== 0) {
            const page = pages.pop()
            page.ctrl.abort()
            if (page.resolved) {
                page.node.dispatchEvent(disconnectEvent)
            }
            target.innerHTML = ""
        }

        const page = {
            node: null,
            resolved: false,
            ctrl: new AbortController()
        }

        pages.push(page)

        try {
            page.node = await result
        } catch (err) {
            console.error(err)
            page.node = renderErrorPage(err)
        }

        page.resolved = true

        if (page.node instanceof Node && !page.ctrl.signal.aborted) {
            target.innerHTML = ""
            target.appendChild(page.node)
            setTimeout(activateLinks)
        }
    }
}

function activateLinks() {
    const { pathname } = location
    const links = Array.from(document.querySelectorAll("a"))
    for (const link of links) {
        if (link.pathname === pathname) {
            link.setAttribute("aria-current", "page")
        } else {
            link.removeAttribute("aria-current")
        }
    }
}

function detectLang() {
    const preferredLang = localStorage.getItem("preferred_lang")
    if (preferredLang === "es") {
        return "es"
    }

    if (Array.isArray(window.navigator.languages)) {
        for (const lang of window.navigator.languages) {
            if (typeof lang === "string" && (lang === "es" || lang.startsWith("es-"))) {
                return "es"
            }
        }
    }
    if (typeof window.navigator["userLanguage"] === "string") {
        if (window.navigator["userLanguage"] === "es" || window.navigator["userLanguage"].startsWith("es-")) {
            return "es"
        }
    }

    if (typeof window.navigator.language === "string") {
        if (window.navigator.language === "es" || window.navigator.language.startsWith("es-")) {
            return "es"
        }
    }

    return "en"
}
