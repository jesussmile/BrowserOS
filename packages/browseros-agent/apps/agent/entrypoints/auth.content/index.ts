export default defineContentScript({
  matches: ['https://browseros.invalid/home'],
  runAt: 'document_start',
  main() {
    // Upstream cloud auth is disabled in the private local-first build.
  },
})
