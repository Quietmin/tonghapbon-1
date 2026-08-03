import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// process.cwd()가 프로젝트 밖일 수 있으므로 Tailwind 설정 경로를 명시적으로 지정
const here = dirname(fileURLToPath(import.meta.url))

export default {
  plugins: {
    tailwindcss: { config: join(here, 'tailwind.config.js') },
    autoprefixer: {},
  },
}
