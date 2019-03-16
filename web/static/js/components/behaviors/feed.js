/**
 * @param {Element} el
 */
function makeFeed(el) {
    let loading = false
    let index = 0

    el.setAttribute('role', 'feed')
    el.setAttribute('aria-busy', 'false')

    /**
     * @param {MutationRecord[]} mutations
     */
    const mutationCallback = mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node instanceof Element) {
                    node.setAttribute('tabindex', '-1')
                }
            }
        }
    }

    /**
     * @param {KeyboardEvent} ev
     */
    const onKeyDown = ev => {
        if (ev.key === 'ArrowUp') {
            index = Math.max(0, index - 1)
        } else if (ev.key === 'ArrowDown') {
            index = Math.min(el.children.length - 1, index + 1)
        } else if (ev.ctrlKey && ev.key === 'Home') {
            index = 0
        } else if (ev.ctrlKey && ev.key === 'End') {
            index = el.children.length - 1
        } else {
            return
        }

        const child = el.children[index]
        if (child instanceof HTMLElement) {
            child.focus()
        }
    }

    const mo = new MutationObserver(mutationCallback)
    mo.observe(el, { childList: true })
    el.addEventListener('keydown', onKeyDown)

    return {
        set loading(val) {
            loading = Boolean(val)
            el.setAttribute('aria-busy', String(loading))
        },

        get loading() {
            return loading
        },

        teardown() {
            mo.disconnect()
            el.removeAttribute('aria-busy')
            el.removeEventListener('keydown', onKeyDown)
        },
    }
}

/**
 * @param {HTMLElement} el
 * @param {HTMLButtonElement} loadMoreButton
 * @param {Object} opts
 * @param {any[]} opts.items
 * @param {function(any):Element} opts.renderItem
 * @param {function(any):Promise<any[]>} opts.getMoreItems
 * @param {number} opts.pageSize
 * @param {function(any):any=} opts.getID
 * @param {function(Error):any=} opts.onError
 */
export function makeInfiniteList(el, loadMoreButton, opts) {
    const feed = makeFeed(el)

    const onLoadMoreClick = async () => {
        if (feed.loading) {
            return
        }

        feed.loading = true
        loadMoreButton.disabled = true

        try {
            const lastItem = opts.items[opts.items.length - 1]
            const newItems = await opts.getMoreItems(lastItem === undefined ? undefined
                : typeof opts.getID === 'function'
                    ? opts.getID(lastItem)
                    : lastItem['id']
            )
            opts.items.push(...newItems)
            for (const item of newItems) {
                el.appendChild(opts.renderItem(item))
            }
            if (newItems.length < opts.pageSize) {
                loadMoreButton.removeEventListener('click', onLoadMoreClick)
                loadMoreButton.remove()
            }
        } catch (err) {
            if (typeof opts.onError === 'function') {
                opts.onError(err)
            } else {
                console.error(err)
            }
        } finally {
            feed.loading = false
            loadMoreButton.disabled = false
        }
    }

    for (const item of opts.items) {
        el.appendChild(opts.renderItem(item))
    }

    if (opts.items.length === opts.pageSize) {
        loadMoreButton.addEventListener('click', onLoadMoreClick)
        loadMoreButton.hidden = false
    } else {
        loadMoreButton.remove()
    }

    return () => {
        feed.teardown()
        loadMoreButton.removeEventListener('click', onLoadMoreClick)
    }
}
