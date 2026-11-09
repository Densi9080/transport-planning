declare module 'proj4' {
  interface Converter {
    forward(point: number[]): number[]
    inverse(point: number[]): number[]
  }

  function proj4(from: string, to: string): Converter
  export default proj4
}
