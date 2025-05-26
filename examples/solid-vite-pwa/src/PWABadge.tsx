import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { useRegisterSW } from 'virtual:pwa-register/solid'

import styles from './PWABadge.module.css'

const PWABadge: Component = () => {
  // check for updates every hour
  const period = 60 * 60 * 1000

  const {
    
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      if (period <= 0) return
      if (r?.active?.state === 'activated') {
        registerPeriodicSync(period, swUrl, r)
      }
      else if (r?.installing) {
        r.installing.addEventListener('statechange', (e) => {
          const sw = e.target as ServiceWorker
          if (sw.state === 'activated')
            registerPeriodicSync(period, swUrl, r)
        })
      }
    },
  })

  function close() {
    
    setNeedRefresh(false)
  }

  return (
    <div class={styles.Container} role="alert" aria-labelledby="toast-message">
      <Show when={needRefresh()}>
        <div class={styles.Toast}>
          <div class={styles.Message}>
            <span id="toast-message">New content available, click on reload button to update.</span>
          </div>
          <div>
            <button class={styles.ToastButton} onClick={() => updateServiceWorker()}>Reload</button>
            <button class={styles.ToastButton} onClick={() => close()}>Close</button>
          </div>
        </div>
      </Show>
    </div>
  )
}

export default PWABadge

/**
 * This function will register a periodic sync check every hour, you can modify the interval as needed.
 */
function registerPeriodicSync(period: number, swUrl: string, r: ServiceWorkerRegistration) {
  if (period <= 0) return

  setInterval(async () => {
    if ('onLine' in navigator && !navigator.onLine)
      return

    const resp = await fetch(swUrl, {
      cache: 'no-store',
      headers: {
        'cache': 'no-store',
        'cache-control': 'no-cache',
      },
    })

    if (resp?.status === 200)
      await r.update()
  }, period)
}
