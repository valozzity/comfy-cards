// Card type, drawn on canvas in the browser: condensed bold caps for the name, a plain sans for the description.
// Imported by the page so the @font-face rules exist before the text layer is drawn.
import { Oswald, Inter } from "next/font/google";

export const nameFont = Oswald({ subsets: ["latin"], weight: "700", display: "block" });
export const bodyFont = Inter({ subsets: ["latin"], weight: ["400", "600"], display: "block" });
