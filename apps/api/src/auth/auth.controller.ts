import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/auth';
import { AuthService } from './auth.service';
import { DemoService } from './demo.service';
import { DemoLoginDto, LoginDto, QuickRegisterDto, RefreshDto, RegisterDto } from './auth.dto';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private demo: DemoService) {}

  /** Demo accounts shown on the sign-in pages (empty when ENABLE_DEMO_LOGIN=false). */
  @Get('demo')
  demoPersonas() {
    return this.demo.personas();
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('quick-register')
  quickRegister(@Body() dto: QuickRegisterDto) { return this.auth.quickRegister(dto); }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('demo/login')
  demoLogin(@Body() dto: DemoLoginDto) {
    return this.demo.login(dto.persona);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.identifier, dto.password);
  }

  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @HttpCode(200)
  @Post('logout')
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }
}
