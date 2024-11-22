import browser from 'webextension-polyfill'
import { useEffect, useRef, useState } from 'react'
import { GetAll, isClear, isGetAllResponse, isMessage, Message } from '../utils/index.ts'

export function App() {
  const [messages, setMessages] = useState<readonly string[] | undefined>()
  useEffect(() => {
    browser.runtime.sendMessage({ type: 'get_all' } satisfies GetAll).then((response) => {
      if (!isGetAllResponse(response)) return
      setMessages(response.messages)
    })

    const f = (message): any => {
      if (isClear(message)) setMessages([])
      else if (isMessage(message)) setMessages((prev) => prev.concat(message.content))
    }
    browser.runtime.onMessage.addListener(f)
    return () => browser.runtime.onMessage.removeListener(f)
  }, [])
  const ref = useRef<HTMLInputElement>()
  return (
    <>
      WebExtension example
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!ref.current) return
          browser.runtime.sendMessage({ type: 'message', content: ref.current.value } satisfies Message)
          ref.current.value = ''
        }}
      >
        <input ref={ref} />
        <input type="submit" value="Send" disabled={!ref.current || !messages} />
      </form>
      <p>Type "/clear" to clear.</p>
      <ol>
        {messages?.map((message, index) => (
          <div key={index}>{message}</div>
        ))}
      </ol>
    </>
  )
}
