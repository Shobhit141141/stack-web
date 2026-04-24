import { getSupabase } from "./supabase"

// opens supabase google oauth in a chrome tab flow and completes session in the extension
export async function signInWithGoogle(): Promise<void> {
  const supabase = getSupabase()
  const redirectTo = chrome.identity.getRedirectURL()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  })
  if (error) throw error
  const url = data.url
  if (!url) throw new Error("No OAuth URL from Supabase")

  const responseUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (cbUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      if (!cbUrl) {
        reject(new Error("Sign-in was cancelled"))
        return
      }
      resolve(cbUrl)
    })
  })

  const parsed = new URL(responseUrl)
  if (parsed.searchParams.get("code")) {
    const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(responseUrl)
    if (exchangeErr) throw exchangeErr
    return
  }

  const hash = parsed.hash.replace(/^#/, "")
  const params = new URLSearchParams(hash)
  const access_token = params.get("access_token")
  const refresh_token = params.get("refresh_token")
  if (!access_token || !refresh_token) {
    throw new Error("Could not read session from sign-in redirect")
  }
  const { error: sessionErr } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  })
  if (sessionErr) throw sessionErr
}
