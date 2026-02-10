import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button, message } from 'antd'
import { useEffect } from 'react'

function ReloadPrompt() {
    const {
        offlineReady: [offlineReady, setOfflineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r: any) {
            console.log('SW Registered: ' + r)
        },
        onRegisterError(error: any) {
            console.log('SW registration error', error)
        },
    })

    useEffect(() => {
        if (offlineReady) {
            // message.success('App is ready to work offline')
            setOfflineReady(false)
        }
    }, [offlineReady, setOfflineReady])

    useEffect(() => {
        if (needRefresh) {
            message.info({
                content: (
                    <span>
                        New content available, click on reload button to update.
                        <Button
                            type="link"
                            size="small"
                            onClick={() => updateServiceWorker(true)}
                            style={{ marginLeft: 8 }}
                        >
                            Reload
                        </Button>
                        <Button
                            type="link"
                            size="small"
                            onClick={() => setNeedRefresh(false)}
                        >
                            Close
                        </Button>
                    </span>
                ),
                duration: 0, // Keep it open until clicked
                key: 'pwa-update-prompt',
            })
        }
    }, [needRefresh, updateServiceWorker, setNeedRefresh])

    return null
}

export default ReloadPrompt
