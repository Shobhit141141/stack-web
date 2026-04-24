// uses chrome.debugger Page.printToPDF on the active tab (user must accept debugger permission once)
export async function printActiveTabToPdfBlob(): Promise<{ blob: Blob; suggestedName: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const tabId = tab?.id
  if (tabId == null) throw new Error("No active tab")

  const target = { tabId }
  await new Promise<void>((resolve, reject) => {
    chrome.debugger.attach(target, "1.3", () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve()
    })
  })

  try {
    const result = await new Promise<{ data?: string }>((resolve, reject) => {
      chrome.debugger.sendCommand(
        target,
        "Page.printToPDF",
        {
          printBackground: true,
          preferCSSPageSize: false,
        },
        (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          resolve((res as { data?: string }) ?? {})
        },
      )
    })
    const data = result.data
    if (!data) throw new Error("Empty PDF from browser")

    const binary = atob(data)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: "application/pdf" })
    const rawTitle = (tab.title ?? "page").replace(/[/\\?%*:|"<>]/g, "-").slice(0, 120)
    const suggestedName = `${rawTitle || "page"}.pdf`
    return { blob, suggestedName }
  } finally {
    await new Promise<void>((resolve) => {
      chrome.debugger.detach(target, () => resolve())
    })
  }
}
