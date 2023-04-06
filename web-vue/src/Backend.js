export function listUrl(baseUrl, passcode) {
  if (passcode) {
    return `${baseUrl}/list?passcode=${passcode}`
  } else {
    return `${baseUrl}/list`
  }
}

export function reolsveFileUrl(baseUrl, path, passcode) {
  if (passcode) {
    return encodeURI(`${baseUrl}/file/${path}?passcode=${passcode}`)
  } else {
    return encodeURI(`${baseUrl}/file/${path}`)
  }
}

export function suffixWithPasscode(url, passcode) {
  const passcodeSuffix = `?passcode=${encodeURI(passcode)}`
  if (passcode && !url.endsWith(passcodeSuffix)) {
    return `${url}${passcodeSuffix}`
  } else {
    return url
  }
}