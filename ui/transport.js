// The local Node dashboard uses HTTP. The public build replaces only this
// transport module with the browser-local adapter; UI and detector stay shared.
export const request = (path, options) => fetch(path, options);
