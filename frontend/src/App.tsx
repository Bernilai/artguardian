import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts';
import { Layout } from "./components";
import { Dashboard, Collection, Tickets, Analytics, Settings, Profile, Login, Register } from './pages';
import { ProtectedRoute } from './components';
import './App.css';

function App() {
    return (
        <AuthProvider>
            <Router>
                <Routes>
                    {/* Публичные маршруты */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />

                    {/* Защищённые маршруты */}
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/*" element={
                        <ProtectedRoute>
                            <Layout>
                                <Routes>
                                    <Route path="/dashboard" element={<Dashboard />} />
                                    <Route path="/collection" element={<Collection />} />
                                    <Route path="/tickets" element={<Tickets />} />
                                    <Route path="/analytics" element={<Analytics />} />
                                    <Route path="/settings" element={
                                        <ProtectedRoute requiredRole="admin">
                                            <Settings />
                                        </ProtectedRoute>
                                    } />
                                    <Route path="/profile" element={<Profile />} />
                                </Routes>
                            </Layout>
                        </ProtectedRoute>
                    } />
                </Routes>
            </Router>
        </AuthProvider>
    );
}

export default App;