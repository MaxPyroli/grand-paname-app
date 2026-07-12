import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const light = {
  bg:         '#ffffff',
  bgFloat:    'rgba(255,255,255,0.92)',
  bgSubtle:   '#f1f2f6',
  bgCard:     '#ffffff',
  text:       '#25303b',
  textSub:    '#7f8c8d',
  textTab:    '#8E8E93',
  border:     '#f0f2f5',
  borderCard: 'rgba(210,218,230,0.8)',
  dragBar:    '#d0d5dc',
  pillActive: '#EBEBEB',
  pillCenter: '#DDEEFF',
  accent:     '#3498db',
  btnBg:      '#f1f2f6',
  iconGareBg: '#e3f2fd',
};

const dark = {
  bg:         '#010e26',
  bgFloat:    'rgba(1,14,38,0.97)',
  bgSubtle:   '#07213f',
  bgCard:     '#031a3a',
  text:       '#ddeeff',
  textSub:    '#6e99cc',
  textTab:    '#4d7ab0',
  border:     '#0d2e58',
  borderCard: 'rgba(20,60,120,0.45)',
  dragBar:    '#164070',
  pillActive: '#07213f',
  pillCenter: '#0a2d64',
  accent:     '#5ab3f5',
  btnBg:      '#07213f',
  iconGareBg: '#0a2d64',
};

// Mode sombre OLED : fonds en noir pur pour économiser la batterie sur les
// écrans OLED (les pixels noirs sont éteints). Texte/accent/bordures repris
// du thème sombre classique pour garder la même lisibilité.
const oled = {
  ...dark,
  bg:         '#000000',
  bgFloat:    'rgba(0,0,0,0.97)',
  bgSubtle:   '#050505',
  bgCard:     '#000000',
  border:     '#141414',
  borderCard: 'rgba(255,255,255,0.08)',
  dragBar:    '#1c1c1c',
  pillActive: '#0a0a0a',
  pillCenter: '#0a0a0a',
  btnBg:      '#0a0a0a',
  iconGareBg: '#0a0a0a',
};

export const C = { light, dark, oled };

export type ThemeColors = typeof C.light;
export type ThemePref = 'auto' | 'light' | 'dark';

export const ThemeContext = createContext<{
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
  isDark: boolean;
  oled: boolean;
  setOled: (v: boolean) => void;
}>({ pref: 'auto', setPref: () => {}, isDark: false, oled: false, setOled: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>('auto');
  const [oled, setOledState] = useState(false);
  const system = useColorScheme();
  const isDark = pref === 'dark' || (pref === 'auto' && system === 'dark');

  useEffect(() => {
    AsyncStorage.getItem('@gp_theme_pref').then(v => {
      if (v === 'light' || v === 'dark' || v === 'auto') setPrefState(v as ThemePref);
    }).catch(() => {});
    AsyncStorage.getItem('@gp_theme_oled').then(v => { if (v === '1') setOledState(true); }).catch(() => {});
  }, []);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    AsyncStorage.setItem('@gp_theme_pref', p).catch(() => {});
  }, []);

  const setOled = useCallback((v: boolean) => {
    setOledState(v);
    AsyncStorage.setItem('@gp_theme_oled', v ? '1' : '0').catch(() => {});
  }, []);

  return React.createElement(ThemeContext.Provider, { value: { pref, setPref, isDark, oled, setOled } }, children);
}

export function useColors(): ThemeColors {
  const { isDark, oled } = useContext(ThemeContext);
  if (!isDark) return C.light;
  return oled ? C.oled : C.dark;
}
