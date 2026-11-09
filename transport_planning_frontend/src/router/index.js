import { createRouter, createWebHistory } from 'vue-router';
import EditorView from '@/views/EditorView.vue';
import StartView from '@/views/StartView.vue';
const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        { path: '/', name: 'start', component: StartView },
        { path: '/p/:id', name: 'editor', component: EditorView, props: true },
    ],
});
export default router;
