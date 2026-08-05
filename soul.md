# Soul — TambalBan Web

---

## Mengapa Proyek Ini Ada / Why This Project Exists

### Bahasa Indonesia

Ban bocor selalu datang di waktu yang salah — malam hari, di jalan tol, di daerah yang sinyalnya lemah. Pengendara yang panik butuh satu hal secepat mungkin: tukang tambal ban terdekat yang benar-benar buka dan benar-benar ada di lokasi itu.

Aplikasi Android TambalBan sudah menjawab kebutuhan ini di lapangan. Tapi data lokasi bengkel tidak datang dari satu sumber — ia harus dikumpulkan dari banyak orang: pemilik bengkel yang mendaftarkan usahanya, pengendara yang menemukan bengkel baru saat di jalan, relawan yang memetakan daerahnya. Tidak semua kontributor itu punya HP Android atau mau install aplikasi hanya untuk menambahkan satu titik.

**TambalBan Web** adalah pintu masuk kedua ke data yang sama. Siapa pun, dari browser apa pun, bisa membuka peta dan menambahkan bengkel tambal ban yang mereka tahu. Tidak perlu install apa-apa. Data yang masuk diperiksa manusia sebelum tampil ke publik — karena ban bocor bukan tempat untuk mempercayai data yang belum pasti benar.

### English

A flat tire always happens at the wrong time — at night, on a toll road, somewhere the signal is weak. A stranded driver needs exactly one thing, fast: the nearest tire repair shop that is actually open and actually there.

The TambalBan Android app already serves this need in the field. But workshop location data doesn't come from one source — it has to be gathered from many people: shop owners registering their business, drivers who spot a new workshop on the road, volunteers mapping their area. Not every contributor has an Android phone or wants to install an app just to add one pin.

**TambalBan Web** is a second front door onto the same data. Anyone, from any browser, can open the map and add a tire repair shop they know about. Nothing to install. What comes in is checked by a human before it goes public — because a flat tire is not the place to trust unverified data.

---

## Visi / Vision

Setiap tukang tambal ban di Indonesia bisa ditemukan dalam hitungan detik oleh pengendara yang membutuhkannya, di mana pun mereka mengetik atau membuka aplikasinya.

Every tire repair shop in Indonesia findable in seconds by the driver who needs it, whichever door they walk through — app or browser.

---

## Misi / Mission

1. Menyediakan jalur kedua untuk mengumpulkan data bengkel, terpisah dari aplikasi Android tapi menulis ke sumber data yang sama.
2. Menjaga akurasi data di atas kecepatan — satu bengkel palsu bisa membuat pengendara yang panik makin tersesat.
3. Tetap ringan dan gratis: tanpa peta berbayar, tanpa penyimpanan berbayar di luar yang perlu.

1. Provide a second collection path for workshop data, separate from the Android app but writing to the same source of truth.
2. Keep accuracy above speed — one fake workshop can send a panicking driver further astray.
3. Stay light and free: no paid map tiles, no paid storage beyond what's necessary.

---

## Nilai / Values

### Akurat Dulu, Baru Cepat / Accuracy Before Speed
Beda dengan proyek peta komunitas yang mengandalkan voting massal, di sini setiap kiriman diperiksa satu per satu sebelum tampil publik. Alasannya sederhana: orang yang membuka peta ini biasanya sedang darurat.

Unlike community maps that lean on mass voting, every submission here is checked one by one before going public. The reason is simple: the person opening this map is usually in the middle of an emergency.

### Satu Sumber Data, Dua Pintu Masuk / One Source of Truth, Two Front Doors
Web dan aplikasi Android membaca dan menulis ke Supabase project yang sama. Tidak ada data yang terpisah atau harus disinkronkan manual.

Web and the Android app read and write the same Supabase project. No data lives in two places that need manual syncing.

### Gratis dan Terbuka / Free and Open
OpenStreetMap untuk peta, Nominatim untuk geocoding. Tidak ada API berbayar yang jadi titik gagal tunggal untuk sesuatu sesederhana "di mana bengkel terdekat".

OpenStreetMap for tiles, Nominatim for geocoding. No paid API becomes a single point of failure for something as basic as "where's the nearest workshop."

### Sederhana untuk Dijalankan Siapa Saja / Simple Enough to Run
Satu password admin, satu Supabase project, tidak ada infrastruktur rumit. Siapa pun yang meneruskan proyek ini harus bisa jalanin dalam hitungan menit.

One admin password, one Supabase project, no elaborate infrastructure. Whoever picks this project up later should be running it within minutes.

---

## Siapa yang Dilayani / Who This Serves

- **Pengendara yang ban bocor** — mencari bengkel terdekat lewat aplikasi Android, ditolong oleh data yang masuk lewat web ini.
- **Pemilik bengkel** — mendaftarkan tempat usahanya tanpa perlu install aplikasi.
- **Kontributor lepas** — pengendara atau relawan yang menemukan bengkel baru saat di jalan dan ingin menambahkannya cepat, dari HP atau laptop mana pun.
- **Admin/moderator** — memeriksa kiriman sebelum tampil publik, menjaga kualitas data yang dipakai orang dalam kondisi darurat.

- **Drivers with a flat tire** — searching via the Android app, served by data that came in through this website.
- **Workshop owners** — registering their business without installing anything.
- **Casual contributors** — drivers or volunteers who spot a new workshop and want to add it quickly, from any phone or laptop.
- **Admin/moderator** — reviews submissions before they go public, guarding the quality of data people rely on in an emergency.

---

## Semangat Pengambilan Keputusan / Decision-Making Spirit

Ketika ada pilihan yang harus diambil dalam proyek ini, tanyakan:

1. **Apakah ini membuat bengkel lebih cepat ditemukan saat darurat?** Kalau tidak, pertimbangkan ulang.
2. **Apakah ini menjaga data tetap akurat?** Kecepatan tidak boleh mengorbankan kebenaran data — bengkel palsu lebih berbahaya daripada bengkel yang belum ditambahkan.
3. **Apakah ini tetap konsisten dengan data yang dipakai aplikasi Android?** Web dan app berbagi satu sumber kebenaran, jangan sampai bercabang.
4. **Apakah ini tetap ringan dan gratis untuk dijalankan?** Jangan menambah dependensi berbayar atau kompleksitas tanpa alasan kuat.

When a decision must be made in this project, ask:

1. **Does this make a workshop findable faster in an emergency?** If not, reconsider.
2. **Does this keep the data accurate?** Speed must never come at the cost of correctness — a fake workshop is worse than a missing one.
3. **Does this stay consistent with what the Android app reads?** Web and app share one source of truth; don't let it fork.
4. **Does this stay light and free to run?** Don't add paid dependencies or complexity without strong justification.

---

*Ban bocor tidak bisa menunggu birokrasi. Setiap detik yang dihemat di peta ini adalah detik yang tidak dihabiskan berdiri di pinggir jalan.*

*A flat tire cannot wait on bureaucracy. Every second saved on this map is a second not spent standing on the roadside.*
