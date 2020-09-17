import { SubtitleStream } from 'matroska-subtitles'

const client = new WebTorrent()
// const sintel = 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F'
const mkv = 'magnet:?xt=urn:btih:db5d889aa12177fedb39be6886e15bb6711f3e41&dn=ch_con.mkv&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com'
const scope = './'
const sw = navigator.serviceWorker.register(`sw.js`, { scope })

let subtitleStream

// client.add(sintel, async function(torrent) {
//   await sw
//   const video = document.createElement('video')
//   video.controls = true
//   video.src = `${scope}webtorrent/${torrent.infoHash}/${encodeURI(torrent.files[5].path)}`//specified scope in source and encoded uri of filepath to fix some weird filenames
//   video.style.width = '300px'
//   document.body.appendChild(video)
// })

client.add(mkv, async function(torrent) {
  await sw
  const video = document.createElement('video')
  video.controls = true
  video.src = `${scope}webtorrent/${torrent.infoHash}/${encodeURI(torrent.files[0].path)}`
  video.style.width = '400px'
  video.autoplay = true
  document.body.appendChild(video)
})

function serveFile (file, req) {
  const res = {
    status: 200,
    headers: {
      'Content-Type': file._getMimeType(),
      // Support range-requests
      'Accept-Ranges': 'bytes'
    }
  }

  // `rangeParser` returns an array of ranges, or an error code (number) if
  // there was an error parsing the range.
  let range = rangeParser(file.length, req.headers.get('range') || '')

  if (Array.isArray(range)) {
    res.status = 206 // indicates that range-request was understood

    // no support for multi-range request, just use the first range
    range = range[0]

    res.headers['Content-Range'] = `bytes ${range.start}-${range.end}/${file.length}`
    res.headers['Content-Length'] =  `${range.end - range.start + 1}`
  } else {
    range = null
    res.headers['Content-Length'] = file.length
  }

  res.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
  res.headers['Expires'] = '0'

  res.body = req.method === 'HEAD' ? '' : 'stream'

  console.log('set stream range:', range)

  if (subtitleStream) {
    subtitleStream = subtitleStream.seekTo(range.start)
  } else {  
    if (range.start !== 0) {
      console.error('Starting subtitle stream at unstable position')
    }

    subtitleStream = new SubtitleStream() 

    subtitleStream.once('tracks', function (tracks) {
      console.log(tracks)
    })
  }

  subtitleStream.once('cues', function () {
    console.log('seeking ready')
  })

  subtitleStream.on('subtitle', function (subtitle, trackNumber) {
    console.log('Track ' + trackNumber + ':', subtitle)
  })

  file.createReadStream(range).pipe(subtitleStream)

  return [res, req.method === 'GET' && subtitleStream]
}

// kind of a fetch event from service worker but for the main thread.
navigator.serviceWorker.addEventListener('message', evt => {
  const request = new Request(evt.data.url, {
    headers: evt.data.headers,
    method: evt.data.method
  })

  const [ port ] = evt.ports
  const respondWith = msg => port.postMessage(msg)
  const pathname = request.url.split(evt.data.scope + 'webtorrent/')[1]
  let [ infoHash, ...filePath ] = pathname.split('/')
  filePath = decodeURI(filePath.join('/'))

  if (!infoHash || !filePath) return

  const torrent = client.get(infoHash)
  const file = torrent.files.find(file => file.path === filePath)

  const [response, stream] = serveFile(file, request)
  const asyncIterator = stream && stream[Symbol.asyncIterator]()

  respondWith(response)

  async function pull () {
    respondWith((await asyncIterator.next()).value)
  }

  port.onmessage = pull
})
