import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const savedTheme = localStorage.getItem('irons-theme');
document.documentElement.setAttribute('data-theme', savedTheme === 'light' ? 'light' : 'dark');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
