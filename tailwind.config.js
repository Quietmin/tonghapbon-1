import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// process.cwd()가 프로젝트 밖(워크스페이스 루트)일 수 있으므로 설정 파일 기준 절대경로로 스캔
const here = dirname(fileURLToPath(import.meta.url))

/** @type {import('tailwindcss').Config} */
export default {
  content: [join(here, 'index.html'), join(here, 'src/**/*.{js,jsx}')],
  safelist: [
    // 동적으로 조합되는 색상 유틸 (분야/상태별)
    ...['primary', 'status-success', 'status-warning', 'status-error', 'status-info', 'secondary', 'error'].flatMap(
      (c) => [`bg-${c}`, `text-${c}`, `border-${c}`, `bg-${c}/10`, `bg-${c}/20`]
    ),
  ],
  theme: {
    extend: {
      colors: {
        'on-background': '#181c23',
        'surface-dim': '#d8d9e5',
        'outline-variant': '#c1c6d7',
        'surface-container': '#ecedf9',
        'surface-container-low': '#f1f3fe',
        'surface-container-lowest': '#ffffff',
        'surface-container-high': '#e6e8f3',
        'surface-container-highest': '#e0e2ed',
        'surface-variant': '#e0e2ed',
        'surface-glass': 'rgba(255, 255, 255, 0.7)',
        'surface-bright': '#f9f9ff',
        surface: '#f9f9ff',
        background: '#f9f9ff',
        error: '#ba1a1a',
        'error-container': '#ffdad6',
        'on-error': '#ffffff',
        'on-error-container': '#93000a',
        primary: '#0058bc',
        'primary-container': '#0070eb',
        'primary-fixed': '#d8e2ff',
        'primary-fixed-dim': '#adc6ff',
        'on-primary': '#ffffff',
        'on-primary-container': '#fefcff',
        'on-primary-fixed': '#001a41',
        'on-primary-fixed-variant': '#004493',
        'inverse-primary': '#adc6ff',
        secondary: '#5d5e60',
        'secondary-container': '#dfdfe1',
        'secondary-fixed': '#e2e2e4',
        'secondary-fixed-dim': '#c6c6c8',
        'on-secondary': '#ffffff',
        'on-secondary-container': '#616365',
        'on-secondary-fixed': '#1a1c1d',
        'on-secondary-fixed-variant': '#454749',
        tertiary: '#9e3d00',
        'tertiary-container': '#c64f00',
        'tertiary-fixed': '#ffdbcc',
        'tertiary-fixed-dim': '#ffb595',
        'on-tertiary': '#ffffff',
        'on-tertiary-container': '#fffbff',
        'on-tertiary-fixed': '#351000',
        'on-tertiary-fixed-variant': '#7c2e00',
        outline: '#717786',
        'on-surface': '#181c23',
        'on-surface-variant': '#414755',
        'inverse-surface': '#2d3039',
        'inverse-on-surface': '#eef0fc',
        'surface-tint': '#005bc1',
        'status-success': '#34C759',
        'status-warning': '#FF9500',
        'status-error': '#FF3B30',
        'status-info': '#5856D6',
        'border-subtle': 'rgba(0, 0, 0, 0.1)',
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        sm: '0.25rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.5rem',
        full: '9999px',
      },
      spacing: {
        unit: '8px',
        'card-padding': '24px',
        gutter: '24px',
        'margin-mobile': '16px',
        'margin-page': '32px',
      },
      fontFamily: {
        sans: ['Inter', 'Pretendard', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        'display-lg': ['34px', { lineHeight: '41px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-md': ['24px', { lineHeight: '30px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-md-mobile': ['20px', { lineHeight: '26px', fontWeight: '600' }],
        'title-sm': ['17px', { lineHeight: '22px', fontWeight: '600' }],
        'body-md': ['15px', { lineHeight: '20px', fontWeight: '400' }],
        'label-caps': ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '600' }],
        'mono-data': ['13px', { lineHeight: '18px', fontWeight: '400' }],
      },
      boxShadow: {
        card: '0 4px 20px rgba(0, 0, 0, 0.04)',
        'card-hover': '0 10px 25px rgba(0, 0, 0, 0.06)',
      },
      maxWidth: {
        content: '1440px',
      },
    },
  },
  plugins: [],
}
