const baseUrl = import.meta.env.VITE_BACKEND_URL
export const backend = {
  url: baseUrl,
  listUrl: `${baseUrl}/list`,
  fileUrl: `${baseUrl}/file`,
  reolsveFileUrl(path) {
    return encodeURI(`${this.fileUrl}/${path}`);
  },
}