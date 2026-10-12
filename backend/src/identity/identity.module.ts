import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { Session, SessionSchema } from './schemas/session.schema';
import { Role, RoleSchema } from './schemas/role.schema';
import { Permission, PermissionSchema } from './schemas/permission.schema';
import { LoginAttempt, LoginAttemptSchema } from './schemas/login-attempt.schema';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { PermissionsService } from './permissions.service';
import { PasswordService } from './password.service';
import { LoginThrottleService } from './login-throttle.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Session.name, schema: SessionSchema },
      { name: Role.name, schema: RoleSchema },
      { name: Permission.name, schema: PermissionSchema },
      { name: LoginAttempt.name, schema: LoginAttemptSchema },
    ]),
  ],
  controllers: [AuthController, UsersController, RolesController],
  providers: [
    AuthService,
    UsersService,
    RolesService,
    PermissionsService,
    PasswordService,
    LoginThrottleService,
  ],
  exports: [AuthService, PermissionsService, UsersService],
})
export class IdentityModule {}
