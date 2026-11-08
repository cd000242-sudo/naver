// Vite turns an imported .svg into its address (small files become data: addresses).
declare module '*.svg' {
    const url: string;
    export default url;
}
