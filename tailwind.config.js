/** Tailwind is precompiled into public/tailwind.css (npm run build:css).
 *  The CDN runtime is no longer loaded in production. */
module.exports = {
  content: ["./public/index.html", "./public/app-*.js", "./public/controls-*.js"],
  // DropBall: Inter + M PLUS 1 (public/assets/fonts, tools/subset-fonts.py).
  // Opacity steps used by the UI that are not in Tailwind's default scale;
  // without them classes such as text-white/88 would generate no CSS at all.
  theme: { extend: { fontFamily: { sans: ["DropBall", "ui-sans-serif", "system-ui", "-apple-system", "\"Hiragino Sans\"", "\"Noto Sans JP\"", "sans-serif"] }, opacity: { 22: "0.22", 28: "0.28", 32: "0.32", 36: "0.36", 38: "0.38", 42: "0.42", 78: "0.78", 88: "0.88" } } },
  plugins: []
};
