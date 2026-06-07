-- Migration 009: Admin RLS policies
-- Authenticated team members get full CRUD on all internal tables.

-- Helper: check if current user is a team member
CREATE OR REPLACE FUNCTION is_team_member()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE auth_user_id = auth.uid()
    AND active = true
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper: check if current user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE auth_user_id = auth.uid()
    AND active = true
    AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ── Contacts ──
CREATE POLICY "Team can view all contacts"
  ON contacts FOR SELECT USING (is_team_member());
CREATE POLICY "Team can insert contacts"
  ON contacts FOR INSERT WITH CHECK (is_team_member());
CREATE POLICY "Team can update contacts"
  ON contacts FOR UPDATE USING (is_team_member());
CREATE POLICY "Admin can delete contacts"
  ON contacts FOR DELETE USING (is_admin());

-- ── Experiences (team policies, public read already exists) ──
CREATE POLICY "Team can view all experiences"
  ON exp_experiences FOR SELECT USING (is_team_member());
CREATE POLICY "Team can insert experiences"
  ON exp_experiences FOR INSERT WITH CHECK (is_team_member());
CREATE POLICY "Team can update experiences"
  ON exp_experiences FOR UPDATE USING (is_team_member());
CREATE POLICY "Admin can delete experiences"
  ON exp_experiences FOR DELETE USING (is_admin());

-- ── Packages ──
CREATE POLICY "Team can view all packages"
  ON exp_packages FOR SELECT USING (is_team_member());
CREATE POLICY "Team can insert packages"
  ON exp_packages FOR INSERT WITH CHECK (is_team_member());
CREATE POLICY "Team can update packages"
  ON exp_packages FOR UPDATE USING (is_team_member());
CREATE POLICY "Admin can delete packages"
  ON exp_packages FOR DELETE USING (is_admin());

-- ── Components ──
CREATE POLICY "Team can view all components"
  ON exp_components FOR SELECT USING (is_team_member());
CREATE POLICY "Team can insert components"
  ON exp_components FOR INSERT WITH CHECK (is_team_member());
CREATE POLICY "Team can update components"
  ON exp_components FOR UPDATE USING (is_team_member());
CREATE POLICY "Admin can delete components"
  ON exp_components FOR DELETE USING (is_admin());

-- ── Package-Component Links ──
CREATE POLICY "Team can view component links"
  ON exp_package_components FOR SELECT USING (is_team_member());
CREATE POLICY "Team can manage component links"
  ON exp_package_components FOR ALL USING (is_team_member());

-- ── Bookings ──
CREATE POLICY "Team can view all bookings"
  ON exp_bookings FOR SELECT USING (is_team_member());
CREATE POLICY "Team can insert bookings"
  ON exp_bookings FOR INSERT WITH CHECK (is_team_member());
CREATE POLICY "Team can update bookings"
  ON exp_bookings FOR UPDATE USING (is_team_member());
CREATE POLICY "Admin can delete bookings"
  ON exp_bookings FOR DELETE USING (is_admin());

-- ── Booking Add-ons ──
CREATE POLICY "Team can view booking addons"
  ON exp_booking_addons FOR SELECT USING (is_team_member());
CREATE POLICY "Team can manage booking addons"
  ON exp_booking_addons FOR ALL USING (is_team_member());

-- ── Vendors ──
CREATE POLICY "Team can view all vendors"
  ON vendors FOR SELECT USING (is_team_member());
CREATE POLICY "Team can insert vendors"
  ON vendors FOR INSERT WITH CHECK (is_team_member());
CREATE POLICY "Team can update vendors"
  ON vendors FOR UPDATE USING (is_team_member());
CREATE POLICY "Admin can delete vendors"
  ON vendors FOR DELETE USING (is_admin());

-- ── Payments ──
CREATE POLICY "Team can view all payments"
  ON exp_payments FOR SELECT USING (is_team_member());
CREATE POLICY "Team can insert payments"
  ON exp_payments FOR INSERT WITH CHECK (is_team_member());
CREATE POLICY "Team can update payments"
  ON exp_payments FOR UPDATE USING (is_team_member());
CREATE POLICY "Admin can delete payments"
  ON exp_payments FOR DELETE USING (is_admin());

-- ── Experience Costs ──
CREATE POLICY "Team can view all costs"
  ON exp_costs FOR SELECT USING (is_team_member());
CREATE POLICY "Team can insert costs"
  ON exp_costs FOR INSERT WITH CHECK (is_team_member());
CREATE POLICY "Team can update costs"
  ON exp_costs FOR UPDATE USING (is_team_member());
CREATE POLICY "Admin can delete costs"
  ON exp_costs FOR DELETE USING (is_admin());

-- ── Hotel Rooms ──
CREATE POLICY "Team can view all rooms"
  ON exp_hotel_rooms FOR SELECT USING (is_team_member());
CREATE POLICY "Team can insert rooms"
  ON exp_hotel_rooms FOR INSERT WITH CHECK (is_team_member());
CREATE POLICY "Team can update rooms"
  ON exp_hotel_rooms FOR UPDATE USING (is_team_member());
CREATE POLICY "Admin can delete rooms"
  ON exp_hotel_rooms FOR DELETE USING (is_admin());

-- ── Task Templates ──
CREATE POLICY "Team can view task templates"
  ON exp_task_templates FOR SELECT USING (is_team_member());
CREATE POLICY "Admin can manage task templates"
  ON exp_task_templates FOR ALL USING (is_admin());

-- ── Tasks ──
CREATE POLICY "Team can view all tasks"
  ON exp_tasks FOR SELECT USING (is_team_member());
CREATE POLICY "Team can insert tasks"
  ON exp_tasks FOR INSERT WITH CHECK (is_team_member());
CREATE POLICY "Team can update tasks"
  ON exp_tasks FOR UPDATE USING (is_team_member());
CREATE POLICY "Admin can delete tasks"
  ON exp_tasks FOR DELETE USING (is_admin());

-- ── Hours Log ──
CREATE POLICY "Team can view all hours"
  ON hours_log FOR SELECT USING (is_team_member());
CREATE POLICY "Team can insert hours"
  ON hours_log FOR INSERT WITH CHECK (is_team_member());
CREATE POLICY "Team can update hours"
  ON hours_log FOR UPDATE USING (is_team_member());
CREATE POLICY "Admin can delete hours"
  ON hours_log FOR DELETE USING (is_admin());

-- ── Team Members ──
CREATE POLICY "Team can view team members"
  ON team_members FOR SELECT USING (is_team_member());
CREATE POLICY "Admin can manage team members"
  ON team_members FOR ALL USING (is_admin());

-- ── Newsletter ──
CREATE POLICY "Team can view subscribers"
  ON newsletter_subscribers FOR SELECT USING (is_team_member());
CREATE POLICY "Admin can manage subscribers"
  ON newsletter_subscribers FOR DELETE USING (is_admin());

-- ── Blog Posts ──
CREATE POLICY "Team can view all blog posts"
  ON exp_blog_posts FOR SELECT USING (is_team_member());
CREATE POLICY "Team can insert blog posts"
  ON exp_blog_posts FOR INSERT WITH CHECK (is_team_member());
CREATE POLICY "Team can update blog posts"
  ON exp_blog_posts FOR UPDATE USING (is_team_member());
CREATE POLICY "Admin can delete blog posts"
  ON exp_blog_posts FOR DELETE USING (is_admin());

-- ── Pages ──
CREATE POLICY "Team can manage pages"
  ON exp_pages FOR ALL USING (is_team_member());

-- ── Hardware ──
CREATE POLICY "Team can view all products"
  ON hw_products FOR SELECT USING (is_team_member());
CREATE POLICY "Team can insert products"
  ON hw_products FOR INSERT WITH CHECK (is_team_member());
CREATE POLICY "Team can update products"
  ON hw_products FOR UPDATE USING (is_team_member());
CREATE POLICY "Admin can delete products"
  ON hw_products FOR DELETE USING (is_admin());

CREATE POLICY "Team can view all variants"
  ON hw_variants FOR SELECT USING (is_team_member());
CREATE POLICY "Team can manage variants"
  ON hw_variants FOR ALL USING (is_team_member());

CREATE POLICY "Team can view all hw inquiries"
  ON hw_inquiries FOR SELECT USING (is_team_member());
CREATE POLICY "Team can manage hw inquiries"
  ON hw_inquiries FOR ALL USING (is_team_member());
