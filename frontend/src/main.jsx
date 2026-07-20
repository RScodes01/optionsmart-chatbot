import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import chatReducer from './store/chatSlice';
import ChatPage from './pages/ChatPage';

// Initialize anonymous device session ID
let uid = localStorage.getItem('os_uid');
if (!uid) {
  uid = uuidv4();
  localStorage.setItem('os_uid', uid);
}
// Attach to all Axios requests automatically
axios.defaults.headers.common['x-uid'] = uid;

const store = configureStore({
  reducer: { chat: chatReducer },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ChatPage />} />
        </Routes>
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
);
