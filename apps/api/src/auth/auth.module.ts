import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DemoService } from './demo.service';
import { accessTokenTtl, refreshTokenDays } from './config';
import { PasswordlessController } from './passwordless.controller';
import { PasswordlessService } from './passwordless.service';
import { PasskeysController, SessionsController } from './passkeys.controller';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        refreshTokenDays();
        const secret = process.env.JWT_SECRET;
        if (!secret || (process.env.NODE_ENV === 'production' && secret.length < 32)) {
          throw new Error('JWT_SECRET must be set (32+ chars in production)');
        }
        return { secret, signOptions: { expiresIn: accessTokenTtl() } };
      },
    }),
  ],
  controllers: [AuthController, PasswordlessController, PasskeysController, SessionsController],
  providers: [AuthService, DemoService, PasswordlessService],
  exports: [AuthService],
})
export class AuthModule {}
