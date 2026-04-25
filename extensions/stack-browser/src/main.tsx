import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Theme } from "@radix-ui/themes"
import "./index.css"
import { App } from "./App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Theme accentColor="gray" grayColor="gray" radius="small" appearance="light">
      <App />
    </Theme>
  </StrictMode>,
)
