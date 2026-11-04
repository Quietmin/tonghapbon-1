/* 서비스 워커 — 홈화면에 설치해 앱처럼 쓰고, 신호가 약한 현장에서도 켜지게 한다.
 * 원본: legacy Photo-Report(뚝 DOC) sw.js 를 Next.js 구조에 맞게 고쳐 옮긴 것.
 *
 * 캐시 전략을 둘로 나눈 이유:
 *   - 페이지(navigate)와 API 는 자주 바뀐다. 캐시를 먼저 주면 배포해도 예전
 *     화면이 계속 떠서, 온라인이면 항상 새로 받는다(network-first).
 *   - /_next/static/ 아래 파일은 이름에 해시가 박혀 있어 내용이 바뀌면 주소도
 *     바뀐다. 그래서 캐시를 먼저 줘도 낡을 수가 없다(cache-first).
 *
 * Supabase 같은 외부 주소는 손대지 않는다. 캐시하면 저장·조회가 깨진다.
 *
 * ⚠️ 캐시를 통째로 비우고 싶으면 CACHE_VERSION 을 올리세요.
 */
var CACHE_VERSION = 'v2';
var CACHE = 'plant-ops-' + CACHE_VERSION;

/* 오프라인에서도 껍데기가 뜨도록 미리 받아 두는 것들.
   페이지 HTML 은 넣지 않는다 — Next 는 라우트마다 내용이 달라 미리 받아도
   금방 낡는다. 대신 오프라인일 때 캐시에 있는 페이지를 되돌려준다. */
var PRECACHE = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      /* addAll 은 하나만 실패해도 전체가 실패한다. 파일 하나가 없다고 설치가
         통째로 실패하면 안 되므로 개별로 담고 실패는 넘긴다. */
      return Promise.all(PRECACHE.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () {
      return self.skipWaiting();   // 새 버전을 기다리지 않고 바로 적용
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        if (name !== CACHE) return caches.delete(name);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* 해시가 박힌 정적 자산만 캐시 우선. 나머지는 전부 네트워크 우선이다. */
function isImmutableAsset(url) {
  return url.pathname.indexOf('/_next/static/') === 0;
}

function networkFirst(request) {
  return fetch(request).then(function (res) {
    if (res && res.ok && request.method === 'GET') {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(request, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(request).then(function (hit) {
      if (hit) return hit;
      // 페이지 이동인데 캐시에도 없으면 시작 화면이라도 보여 준다
      if (request.mode === 'navigate') return caches.match('/');
      throw new Error('offline');
    });
  });
}

function cacheFirst(request) {
  return caches.match(request).then(function (hit) {
    if (hit) return hit;
    return fetch(request).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(request, copy); });
      }
      return res;
    });
  });
}

/* 웹 푸시 — 서버(src/shared/lib/push.ts)가 보낸 payload 를 기기 알림으로 띄운다.
 * 앱(브라우저)이 꺼져 있어도 이 워커가 깨어나 알림을 그린다. payload 가 깨져도
 * 빈 알림이라도 띄운다 — 푸시를 받고 알림을 안 띄우면 브라우저가 구독을 끊을 수 있다. */
self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'PIMS 알림', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || undefined,          // 같은 현황의 알림은 겹치지 않고 갱신
      data: { url: data.url || '/' }
    })
  );
});

/* 알림을 누르면 해당 현황으로 — 이미 열린 창이 있으면 그 창을 옮기고, 없으면 새로 연다 */
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if ('focus' in c && 'navigate' in c) {
          return c.navigate(url).then(function (w) { return (w || c).focus(); });
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url;
  try { url = new URL(request.url); } catch (e) { return; }

  // 외부 주소(Supabase, 폰트 CDN 등)는 그대로 통과시킨다
  if (url.origin !== self.location.origin) return;

  // 서버가 매번 새로 계산해야 하는 것 — 캐시에 얹지 않는다
  if (url.pathname.indexOf('/api/') === 0) return;

  event.respondWith(isImmutableAsset(url) ? cacheFirst(request) : networkFirst(request));
});
