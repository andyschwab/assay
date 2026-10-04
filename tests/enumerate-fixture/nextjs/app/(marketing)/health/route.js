// a route group segment is not part of the URL; methods exported by re-export
function handler() {
  return new Response('ok');
}
export { handler as GET, handler as HEAD };
