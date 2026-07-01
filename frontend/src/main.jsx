import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import chatReducer from './store/chatSlice';
import ChatPage from './pages/ChatPage';

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
