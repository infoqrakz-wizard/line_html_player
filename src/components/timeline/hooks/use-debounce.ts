/**
 * Хук для дебаунса функций
 */
import { useEffect, useRef, useCallback } from 'react';

/**
 * Хук для дебаунса функций
 * @param callback Функция для дебаунса
 * @param delay Задержка в миллисекундах
 * @returns Дебаунс-версия функции
 */
export const useDebounce = <T extends (...args: any[]) => void>(callback: T, delay: number) => {
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  ) as T;
};
