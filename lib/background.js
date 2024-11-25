/** Add this to background scripts */

const isChrome = typeof chrome !== 'undefined'

;(isChrome ? chrome : browser).runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'WTW_INJECT' && sender && sender.tab && sender.tab.id != null) {
    let file = message.file
    try {
      file = new URL(file).pathname
    } catch {}
      if (isChrome) {
        chrome.scripting
        .executeScript({
          target: { tabId: sender.tab.id, frameIds: [sender.frameId] },
          files: [file],
        })
        .then(sendResponse)
      } else {
        browser.executeScript(sender.tab.id, details).then(sendResponse)
      }
      return true
    }
})