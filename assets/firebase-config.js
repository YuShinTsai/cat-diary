/* 雲端同步設定（選用）
 * 把 Firebase 主控台「專案設定 → 一般 → 你的應用程式」裡的 firebaseConfig 貼到下面，取代 null。
 * 這組設定本來就是公開給網頁用的，不是密碼；真正的權限由 firestore.rules 控管。
 * 維持 null = 不使用雲端，資料只存在各自的瀏覽器。詳細步驟見 README。
 *
 * 範例：
 * window.CAT_DIARY_FIREBASE = {
 *   apiKey: 'AIza...',
 *   authDomain: 'my-cat-diary.firebaseapp.com',
 *   projectId: 'my-cat-diary',
 *   storageBucket: 'my-cat-diary.firebasestorage.app',
 *   messagingSenderId: '1234567890',
 *   appId: '1:1234567890:web:abcdef'
 * };
 */
window.CAT_DIARY_FIREBASE = {
  apiKey: 'AIzaSyDeDaqbkl-PbFNnAGZYqLtv7OKCQwr0dvg',
  authDomain: 'cat-diary-7838b.firebaseapp.com',
  projectId: 'cat-diary-7838b',
  storageBucket: 'cat-diary-7838b.firebasestorage.app',
  messagingSenderId: '194242324865',
  appId: '1:194242324865:web:f678398789f30fcc2e6080'
};
