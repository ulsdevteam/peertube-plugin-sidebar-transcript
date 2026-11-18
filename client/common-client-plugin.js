import { parse } from '@plussub/srt-vtt-parser'

function register ({ registerHook }) {
  registerHook({
    target: 'action:embed.player.loaded',
    handler: async ({ player }) => {
      try {
        if (!isTranscriptEnabled()) return
        if (!player) return

        const uuid = getVideoUuidFromUrl()
        if (!uuid) return

        const captions = await fetchCaptions(uuid)
        if (!captions.length) return

        buildTranscriptSidebar(player, captions)
      } catch (err) {
        console.error('[transcript-sidebar]', err)
      }
    }
  })
}

function isTranscriptEnabled () {
  try {
    return new URLSearchParams(window.location.search).get('transcript') === '1'
  } catch (e) {
    return false
  }
}

function getVideoUuidFromUrl () {
  var parts = window.location.pathname.split('/')
  return parts[parts.length - 1] || null
}

async function fetchCaptions (uuid) {
  var res = await fetch('/api/v1/videos/' + encodeURIComponent(uuid) + '/captions')
  if (!res.ok) return []

  var payload = await res.json()
  var captions = payload.data || payload
  if (!Array.isArray(captions) || captions.length === 0) return []

  var results = []

  for (const caption of captions) {
    var captionPath = caption.captionPath || caption.path || caption.fileUrl
    if (!captionPath) continue

    var captionUrl = new URL(captionPath, window.location.origin).href
    var fileRes = await fetch(captionUrl)
    if (!fileRes.ok) continue

    var text = await fileRes.text()
    var entries = parse(text).entries || []

    var segments = entries
      .map(function (entry) {
        var start = Number(entry.from)
        var txt = typeof entry.text === 'string' ? entry.text.trim() : ''
        if (!Number.isFinite(start) || !txt) return null
        return {
          start: start / 1000,
          startFormatted: formatDuration(start / 1000),
          text: txt
        }
      })
      .filter(Boolean)

    if (segments.length > 0) {
      results.push({
        language: caption.language,
        segments: segments
      })
    }
  }

  return results
}

function formatDuration (seconds) {
  var h = Math.floor(seconds / 3600)
  var m = Math.floor((seconds % 3600) / 60)
  var s = Math.floor(seconds % 60)
  var mm = m < 10 ? '0' + m : '' + m
  var ss = s < 10 ? '0' + s : '' + s
  return h > 0 ? h + ':' + mm + ':' + ss : m + ':' + ss
}

function buildTranscriptSidebar (player, captions) {
  var playerEl = player.el()
  if (!playerEl) return

  var sidebar = document.createElement('div')
  sidebar.className = 'vjs-transcript-menu'

  var header = document.createElement('div')
  header.className = 'vjs-transcript-header'

  var title = document.createElement('span')
  title.className = 'vjs-transcript-title'
  title.textContent = 'Transcript'

  var settingsBtn = document.createElement('button')
  settingsBtn.className = 'vjs-transcript-settings'
  settingsBtn.type = 'button'
  settingsBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sliders-horizontal preview-icon"><path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/></svg>'
  settingsBtn.setAttribute('aria-label', 'Transcript settings')

  var closeBtn = document.createElement('button')
  closeBtn.className = 'vjs-transcript-close'
  closeBtn.type = 'button'
  closeBtn.textContent = '\u00d7'
  closeBtn.setAttribute('aria-label', 'Close transcript')

  header.appendChild(title)
  header.appendChild(settingsBtn)
  header.appendChild(closeBtn)
  sidebar.appendChild(header)

  var segmentsContainer = document.createElement('div')
  segmentsContainer.className = 'vjs-transcript-segments'

  var segmentEls = []

  function populateSegments(segments) {
    while (segmentEls.length > 0) {
      segmentsContainer.removeChild(segmentEls.pop())
    }

    for (var i = 0; i < segments.length; i++) {
      (function (seg) {
        var row = document.createElement('div')
        row.className = 'vjs-transcript-segment'
        row.setAttribute('data-start', seg.start)
        row.setAttribute('tabindex', '0')

        var timeSpan = document.createElement('span')
        timeSpan.className = 'vjs-transcript-time'
        timeSpan.textContent = seg.startFormatted

        var textSpan = document.createElement('span')
        textSpan.className = 'vjs-transcript-text'
        textSpan.textContent = seg.text

        row.appendChild(timeSpan)
        row.appendChild(textSpan)

        row.addEventListener('click', function () {
          player.currentTime(seg.start)
          player.play()
        })

        row.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            player.currentTime(seg.start)
            player.play()
          }
        })

        segmentsContainer.appendChild(row)
        segmentEls.push(row)
      })(segments[i])
    }  
  }

  populateSegments(captions[0].segments)

  var settingsContainer = document.createElement('div')
  settingsContainer.className = 'vjs-transcript-language-select'

  var languageLabel = document.createElement('label')
  languageLabel.textContent = 'Language: '

  var languageSelect = document.createElement('select')
  for (var i = 0; i < captions.length; i++) {
    languageSelect.add(new Option(captions[i].label, captions[i].id, i == 0, i == 0))    
  }

  languageLabel.htmlFor = languageSelect.id = 'transcript-language-select'

  languageSelect.addEventListener('change', function () {
    populateSegments(captions[languageSelect.selectedIndex].segments)
  })

  settingsContainer.appendChild(languageLabel)
  settingsContainer.appendChild(languageSelect)
  sidebar.appendChild(settingsContainer)
  sidebar.appendChild(segmentsContainer)
  playerEl.appendChild(sidebar)

  var btn = document.createElement('button')
  btn.className = 'vjs-transcript-button vjs-control vjs-button'
  btn.type = 'button'
  btn.title = 'Transcript'
  btn.innerHTML = '<span class="vjs-icon-placeholder" aria-hidden="true">\u2261</span><span class="vjs-control-text">Transcript</span>'

  var controlBar = playerEl.querySelector('.vjs-control-bar')
  if (controlBar) {
    var fullscreenBtn = controlBar.querySelector('.vjs-fullscreen-control')
    if (fullscreenBtn) {
      controlBar.insertBefore(btn, fullscreenBtn)
    } else {
      controlBar.appendChild(btn)
    }
  }

  var isOpen = false

  function openSidebar () {
    isOpen = true
    playerEl.classList.add('transcript-menu-displayed')
  }

  function closeSidebar () {
    isOpen = false
    playerEl.classList.remove('transcript-menu-displayed')
  }

  btn.addEventListener('click', function () {
    if (isOpen) closeSidebar()
    else openSidebar()
  })

  closeBtn.addEventListener('click', closeSidebar)

  var isLanguageSelectOpen = false

  function showLanguageSelect() {
    isLanguageSelectOpen = true
    settingsContainer.classList.add('transcript-show-language-select')
  }

  function hideLanguageSelect() {
    isLanguageSelectOpen = false
    settingsContainer.classList.remove('transcript-show-language-select')
  }

  settingsBtn.addEventListener('click', function() {
    if (isLanguageSelectOpen) hideLanguageSelect()
    else showLanguageSelect()
  })

  player.on('timeupdate', function () {
    var currentTime = player.currentTime()
    var activeEl = null

    for (var j = 0; j < segmentEls.length; j++) {
      segmentEls[j].classList.remove('vjs-active')
      var segStart = parseFloat(segmentEls[j].getAttribute('data-start'))
      if (segStart <= currentTime) {
        activeEl = segmentEls[j]
      }
    }

    if (activeEl) {
      activeEl.classList.add('vjs-active')
      if (isOpen) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  })
}

export { register }