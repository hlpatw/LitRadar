import { Controller, Get, Render } from '@nestjs/common';

@Controller()
export class ViewController {
  // Serves the SPA shell. No server-injected locals: the built index.html is a static
  // Vite bundle, and the client reads no platform global from the server (the legacy
  // __platform__ render param had no consumer and was removed).
  @Get(['/', '*'])
  @Render('index')
  render(): Record<string, never> {
    return {};
  }
}
