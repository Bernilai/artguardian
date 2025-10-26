import React from 'react';
import './QuickActions.css';

export interface QuickActionsProps {
    children: React.ReactNode;
}

const QuickActions: React.FC<QuickActionsProps> = ({ children }) => {
    return (
        <div className="quick-actions">
            {children}
        </div>
    );
};

export default QuickActions;