const CACHE_NAME = 'peru-driving-test-v5';
const BASE_PATH = '/test-drive-peru-A1';
const urlsToCache = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/styles.css`,
  `${BASE_PATH}/app.js`,
  `${BASE_PATH}/quiz_data.json`,
  `${BASE_PATH}/icon-192.png`,
  `${BASE_PATH}/icon-512.png`,
  // Question images
  `${BASE_PATH}/images/question_100.jpg`,
  `${BASE_PATH}/images/question_140.jpg`,
  `${BASE_PATH}/images/question_141.jpg`,
  `${BASE_PATH}/images/question_187.png`,
  `${BASE_PATH}/images/question_197-300x102.jpg`,
  `${BASE_PATH}/images/question_199.jpg`,
  `${BASE_PATH}/images/question_200.jpg`,
  `${BASE_PATH}/images/question_36.png`,
  `${BASE_PATH}/images/question_94-235x300.png`,
  `${BASE_PATH}/images/senal_deslizante.jpg`,
  `${BASE_PATH}/images/senal_i_14.jpg`,
  `${BASE_PATH}/images/senal_i_18.jpg`,
  `${BASE_PATH}/images/senal_i_19.jpg`,
  `${BASE_PATH}/images/senal_i_20.jpg`,
  `${BASE_PATH}/images/senal_i_31.jpg`,
  `${BASE_PATH}/images/senal_i_9.jpg`,
  `${BASE_PATH}/images/senal_p_15.jpg`,
  `${BASE_PATH}/images/senal_p_17a.jpg`,
  `${BASE_PATH}/images/senal_p_22c.jpg`,
  `${BASE_PATH}/images/senal_p_2a.jpg`,
  `${BASE_PATH}/images/senal_p_31a.jpg`,
  `${BASE_PATH}/images/senal_p_33a.jpg`,
  `${BASE_PATH}/images/senal_p_34.jpg`,
  `${BASE_PATH}/images/senal_p_3a.jpg`,
  `${BASE_PATH}/images/senal_p_41.jpg`,
  `${BASE_PATH}/images/senal_p_45.jpg`,
  `${BASE_PATH}/images/senal_p_46.jpg`,
  `${BASE_PATH}/images/senal_p_46_a.jpg`,
  `${BASE_PATH}/images/senal_p_46b.jpg`,
  `${BASE_PATH}/images/senal_p_48.jpg`,
  `${BASE_PATH}/images/senal_p_48a.jpg`,
  `${BASE_PATH}/images/senal_p_48b.jpg`,
  `${BASE_PATH}/images/senal_p_49.jpg`,
  `${BASE_PATH}/images/senal_p_49a.jpg`,
  `${BASE_PATH}/images/senal_p_49b.jpg`,
  `${BASE_PATH}/images/senal_p_50.jpg`,
  `${BASE_PATH}/images/senal_p_51.jpg`,
  `${BASE_PATH}/images/senal_p_52.jpg`,
  `${BASE_PATH}/images/senal_p_53.jpg`,
  `${BASE_PATH}/images/senal_p_55.jpg`,
  `${BASE_PATH}/images/senal_p_58.jpg`,
  `${BASE_PATH}/images/senal_p_59.jpg`,
  `${BASE_PATH}/images/senal_p_5_1a.jpg`,
  `${BASE_PATH}/images/senal_p_60.jpg`,
  `${BASE_PATH}/images/senal_p_61.jpg`,
  `${BASE_PATH}/images/senal_p_66.jpg`,
  `${BASE_PATH}/images/senal_p_66a.jpg`,
  `${BASE_PATH}/images/senal_r_11a.jpg`,
  `${BASE_PATH}/images/senal_r_14.jpg`,
  `${BASE_PATH}/images/senal_r_16a.jpg`,
  `${BASE_PATH}/images/senal_r_17.jpg`,
  `${BASE_PATH}/images/senal_r_20.jpg`,
  `${BASE_PATH}/images/senal_r_29.jpg`,
  `${BASE_PATH}/images/senal_r_3-1.jpg`,
  `${BASE_PATH}/images/senal_r_30c.jpg`,
  `${BASE_PATH}/images/senal_r_30f.jpg`,
  `${BASE_PATH}/images/senal_r_4.jpg`,
  `${BASE_PATH}/images/senal_r_40.jpg`,
  `${BASE_PATH}/images/senal_r_48.jpg`,
  `${BASE_PATH}/images/senal_r_49.jpg`,
  `${BASE_PATH}/images/senal_r_50.jpg`,
  `${BASE_PATH}/images/senal_r_53.jpg`,
  `${BASE_PATH}/images/senal_r_5_1.jpg`,
  `${BASE_PATH}/images/senal_r_5_2.jpg`,
  `${BASE_PATH}/images/senal_r_5_4.jpg`,
  `${BASE_PATH}/images/senal_r_9.jpg`
];

// Install event - cache resources
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache:', CACHE_NAME);
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.log('Cache install failed:', err);
      })
  );
  // Force the waiting service worker to become the active service worker
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
        return caches.match(`${BASE_PATH}/index.html`);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      console.log('Clearing old caches...');
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker activated:', CACHE_NAME);
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// Send message to all clients when activated
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
