import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DemoService } from './demo.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret || (process.env.NODE_ENV === 'production' && secret.length < 32)) {
          throw new Error('JWT_SECRET must be set (32+ chars in production)');
        }
        return { secret, signOptions: { expiresIn: (process.env.JWT_ACCESS_TTL ?? '15m') as any } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, DemoService],
  exports: [AuthService],
})
export class AuthModule {}
