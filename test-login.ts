import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

async function testLogin() {
  const db = new PrismaClient()
  
  const user = await db.user.findUnique({ where: { email: 'admin@iocm.vn' } })
  
  if (!user) {
    console.log('❌ USER NOT FOUND')
    await db.$disconnect()
    return
  }
  
  console.log('✓ User found:', user.email, '| Status:', user.status)
  console.log('  Hash in DB:', user.passwordHash.substring(0, 30) + '...')
  
  const match = await bcrypt.compare('Admin@IOCM2025', user.passwordHash)
  console.log('  Password "Admin@IOCM2025" match:', match)
  
  if (!match) {
    console.log('❌ PASSWORD MISMATCH - fixing...')
    const newHash = await bcrypt.hash('Admin@IOCM2025', 12)
    await db.user.update({
      where: { email: 'admin@iocm.vn' },
      data: { passwordHash: newHash }
    })
    console.log('✓ Password updated with bcryptjs hash')
    
    // Verify
    const updated = await db.user.findUnique({ where: { email: 'admin@iocm.vn' } })
    const verify = await bcrypt.compare('Admin@IOCM2025', updated!.passwordHash)
    console.log('  Verification after update:', verify)
  } else {
    console.log('✓ Password is correct!')
  }
  
  await db.$disconnect()
}

testLogin()
