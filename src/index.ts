import 'babel-polyfill';
// tslint:disable-next-line:ordered-imports
import { runMain } from './gh';

// tslint:disable-next-line:only-arrow-functions
(function(currentWindow: Window) {
  // execute when load index.js

  // tslint:disable-next-line:no-console
  console.log('hello world');

  // assign Greeter to global
  const myWindow = currentWindow as any;
  myWindow.runMain = runMain;
  // we can use Greeter , execute following in console
  // var greet = new Greeter('myName');
  // greet.greet();
})(window);
