
import { useState, useCallback } from 'react';
import { dbService } from '../services/dbService.ts';
import { Notification, User } from '../types/types.ts';

export const useNotificationsFetch = (user: User | null) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [showNotifications, setShowNotifications] = useState(false);

    const fetchNotifications = useCallback(async () => {
        if (user) {
            try {
                const data = await dbService.getNotifications(user.id);
                setNotifications(data);
            } catch (e) {
                console.error(e);
            }
        }
    }, [user]);

    return {
        notifications,
        setNotifications,
        showNotifications,
        setShowNotifications,
        fetchNotifications
    };
};
