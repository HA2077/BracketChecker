export default{
    base: '/BracketChecker/',
    optimizeDeps: { exclude: ['checker.js'] },
    server: {
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        }
    }
}