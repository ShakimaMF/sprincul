import 'virtual:uno.css'
import Sprincul from '../src/Sprincul.js';
import GroceryList from './models/GroceryList.js';
import CarList from './models/CarList.js';
Sprincul.register('CarList', CarList);
Sprincul.register('GroceryList', GroceryList);
Sprincul.init();