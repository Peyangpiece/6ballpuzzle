/** Tailwind is precompiled into public/tailwind.css (npm run build:css).
 *  The CDN runtime is no longer loaded in production. */
module.exports = {
  content: ["./public/index.html", "./public/app-*.js", "./public/controls-*.js"],
  theme: { extend: {} },
  plugins: []
};
