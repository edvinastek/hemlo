import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'

/** The public site: landing page, privacy policy, account deletion. Google Play
 *  links to the last two, so the site refuses to build without the name and
 *  address the policy must carry. */
export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') }
  for (const key of ['VITE_CONTROLLER_NAME', 'VITE_CONTACT_EMAIL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']) {
    if (!env[key]) throw new Error(`${key} is not set; the public site cannot be built without it.`)
  }
  return {
    root: 'site',
    envDir: resolve(__dirname),
    build: {
      outDir: resolve(__dirname, 'dist-site'),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'site/index.html'),
          privacy: resolve(__dirname, 'site/privacy.html'),
          delete: resolve(__dirname, 'site/delete.html'),
        },
      },
    },
  }
})
