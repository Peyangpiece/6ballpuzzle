import p0 from "./chunks/part0.js";
import p1 from "./chunks/part1.js";
import p2 from "./chunks/part2.js";
import p3 from "./chunks/part3.js";
import p4 from "./chunks/part4.js";
import p5 from "./chunks/part5.js";
import p6 from "./chunks/part6.js";
import p7 from "./chunks/part7.js";
import p8 from "./chunks/part8.js";
import p9 from "./chunks/part9.js";
import p10 from "./chunks/part10.js";
import p11 from "./chunks/part11.js";
import p12 from "./chunks/part12.js";
import p13 from "./chunks/part13.js";

const BASE64_HTML = p0 + p1 + p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9 + p10 + p11 + p12 + p13;

function decodeBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const HTML_BYTES = decodeBase64(BASE64_HTML);

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/TEST_REPORT.txt") {
      return new Response("TEST_REPORT.txt is maintained in the GitHub repository.", {
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }
    return new Response(HTML_BYTES, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache"
      }
    });
  }
};
