import React from 'react';
import './MainLayout.scss';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <div className="main-layout">
      <header className="header">Header</header>
      <div className="content-wrapper">
        <aside className="sidebar">Sidebar</aside>
        <main className="main-content">{children}</main>
      </div>
      <footer className="footer">Footer</footer>
    </div>
  );
};

export default MainLayout;