import './style.css';
import { bootApp } from './app';

const root = document.getElementById('app');
if (!root) throw new Error('找不到 #app 挂载点');

bootApp(root);
