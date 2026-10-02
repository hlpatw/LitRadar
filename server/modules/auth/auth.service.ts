import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { DATABASE, type Database } from '../../database/database.module';
import { users } from '../../database/schema';
import { isAdminEmail } from '../../common/utils/admin.util';

type SafeUser = { id: string; username: string; email: string; displayName: string | null; isAdmin: boolean };

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jwtService: JwtService,
  ) {}

  private shape(u: { id: string; username: string; email: string; displayName: string | null }): SafeUser {
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      displayName: u.displayName,
      isAdmin: isAdminEmail(u.email),
    };
  }

  async register(dto: { username: string; email: string; password: string; displayName?: string }) {
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, dto.username));

    if (existing.length > 0) {
      throw new ConflictException('用户名已存在');
    }

    const emailExisting = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, dto.email));

    if (emailExisting.length > 0) {
      throw new ConflictException('邮箱已被注册');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const [row] = await this.db
      .insert(users)
      .values({
        username: dto.username,
        email: dto.email,
        passwordHash,
        displayName: dto.displayName ?? dto.username,
      })
      .returning({ id: users.id, username: users.username, email: users.email, displayName: users.displayName });

    const user = this.shape(row);
    const token = this.jwtService.sign({ sub: user.id, username: user.username, email: user.email });
    return { user, token };
  }

  async login(dto: { username: string; password: string }) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.username, dto.username));

    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const token = this.jwtService.sign({ sub: user.id, username: user.username, email: user.email });
    return {
      user: this.shape(user),
      token,
    };
  }

  async getProfile(userId: string) {
    const [row] = await this.db
      .select({ id: users.id, username: users.username, email: users.email, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId));

    if (!row) {
      throw new UnauthorizedException('用户不存在');
    }

    return this.shape(row);
  }
}