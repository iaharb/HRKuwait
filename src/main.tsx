import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { NotificationProvider } from './components/NotificationSystem.tsx';
import { ThemeProvider } from './components/ThemeContext.tsx';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './translations.ts';
import './styles/index.css'; // Added local css import

import { BrowserRouter } from 'react-router-dom';

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <NotificationProvider>
          <App />
        </NotificationProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
