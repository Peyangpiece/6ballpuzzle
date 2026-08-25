class BodyInjector {
  element(element) {
    element.append('<script src="/firebase-config.js"></script>', { html: true });
    element.append('<script src="/enhancements.js"></script>', { html: true });
    element.append('<script type="module" src="/firebase-bridge.js"></script>', { html: true });
  }
}
class HeadInjector {
  element(element) {
    element.append('<link rel="stylesheet" href="/enhancements.css">', { html: true });
  }
}
export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return response;
    return new HTMLRewriter().on('head', new HeadInjector()).on('body', new BodyInjector()).transform(response);
  }
};
