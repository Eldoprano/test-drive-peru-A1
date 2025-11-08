const CACHE_NAME = 'peru-driving-test-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/quiz_data.json',
  '/icon-192.png',
  '/icon-512.png',
  // Question images
  'images/question_100.jpg',
  'images/question_140.jpg',
  'images/question_141.jpg',
  'images/question_187.jpg',
  'images/question_197-300x102.jpg',
  'images/question_199.jpg',
  'images/question_200.jpg',
  'images/question_36.jpg',
  'images/question_94-235x300.jpg',
  'images/senal_deslizante.jpg',
  'images/senal_i_14.jpg',
  'images/senal_i_18.jpg',
  'images/senal_i_19.jpg',
  'images/senal_i_20.jpg',
  'images/senal_i_31.jpg',
  'images/senal_i_9.jpg',
  'images/senal_p_15.jpg',
  'images/senal_p_17a.jpg',
  'images/senal_p_22c.jpg',
  'images/senal_p_2a.jpg',
  'images/senal_p_31a.jpg',
  'images/senal_p_33a.jpg',
  'images/senal_p_34.jpg',
  'images/senal_p_3a.jpg',
  'images/senal_p_41.jpg',
  'images/senal_p_45.jpg',
  'images/senal_p_46.jpg',
  'images/senal_p_46_a.jpg',
  'images/senal_p_46b.jpg',
  'images/senal_p_48.jpg',
  'images/senal_p_48a.jpg',
  'images/senal_p_48b.jpg',
  'images/senal_p_49.jpg',
  'images/senal_p_49a.jpg',
  'images/senal_p_49b.jpg',
  'images/senal_p_50.jpg',
  'images/senal_p_51.jpg',
  'images/senal_p_52.jpg',
  'images/senal_p_53.jpg',
  'images/senal_p_55.jpg',
  'images/senal_p_58.jpg',
  'images/senal_p_59.jpg',
  'images/senal_p_5_1a.jpg',
  'images/senal_p_60.jpg',
  'images/senal_p_61.jpg',
  'images/senal_p_66.jpg',
  'images/senal_p_66a.jpg',
  'images/senal_r_11a.jpg',
  'images/senal_r_14.jpg',
  'images/senal_r_16a.jpg',
  'images/senal_r_17.jpg',
  'images/senal_r_20.jpg',
  'images/senal_r_29.jpg',
  'images/senal_r_3-1.jpg',
  'images/senal_r_30c.jpg',
  'images/senal_r_30f.jpg',
  'images/senal_r_4.jpg',
  'images/senal_r_40.jpg',
  'images/senal_r_48.jpg',
  'images/senal_r_49.jpg',
  'images/senal_r_50.jpg',
  'images/senal_r_53.jpg',
  'images/senal_r_5_1.jpg',
  'images/senal_r_5_2.jpg',
  'images/senal_r_5_4.jpg',
  'images/senal_r_9.jpg'
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.log('Cache install failed:', err);
      })
  );
  self.skipWaiting();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        return fetch(event.request).then(
          response => {
            // Check if valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
      .catch(() => {
        // If both cache and network fail, could return a custom offline page
        return caches.match('/index.html');
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  return self.clients.claim();
});
