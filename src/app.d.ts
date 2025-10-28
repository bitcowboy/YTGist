// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

// Optional type shims for stream-json when @types are unavailable
declare module 'stream-json' {
  export function parser(options?: any): any;
}
declare module 'stream-json/Assembler' {
  const Assembler: any;
  export default Assembler;
}

export { };